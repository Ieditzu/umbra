package server

import "net/http"

type obj = map[string]any

func (s *Server) openapi(w http.ResponseWriter, r *http.Request) {
	stringType := obj{"type": "string"}
	numberType := obj{"type": "number"}
	ref := func(name string) obj { return obj{"$ref": "#/components/schemas/" + name} }
	schemas := obj{
		"Error":           obj{"type": "object", "properties": obj{"error": obj{"type": "object", "required": []string{"code", "message"}, "properties": obj{"code": stringType, "message": stringType}}}},
		"Media":           obj{"type": "object", "properties": obj{"id": stringType, "role": stringType, "name": stringType, "metadata": obj{"type": "object"}, "expires_at": obj{"type": "string", "format": "date-time"}}},
		"AnalysisRequest": obj{"type": "object", "additionalProperties": false, "required": []string{"name", "calibration_media_id", "main_media_id"}, "properties": obj{"name": obj{"type": "string", "minLength": 1, "maxLength": 100}, "calibration_media_id": stringType, "main_media_id": stringType, "ground_truth_media_id": stringType, "recorded_at": obj{"type": "string", "format": "date-time"}, "latitude": obj{"type": "number", "minimum": -90, "maximum": 90}, "longitude": obj{"type": "number", "minimum": -180, "maximum": 180}, "shadow_region": obj{"type": "object", "required": []string{"x", "y", "width", "height"}, "properties": obj{"x": numberType, "y": numberType, "width": numberType, "height": numberType}, "description": "Normalized rectangle inside the trial frame. Width and height must exceed 0.02."}}},
		"Analysis":        obj{"type": "object", "properties": obj{"id": stringType, "name": stringType, "status": obj{"type": "string", "enum": []string{"queued", "running", "succeeded", "failed"}}, "progress": numberType, "message": stringType, "result": obj{"type": []string{"object", "null"}, "description": "Existing Umbra scientific result: state, confidence, lead_time_s, reasons, scene_assessment, timeline and evidence. Valid no-signal results consume one credit."}, "request": ref("AnalysisRequest"), "expires_at": obj{"type": "string", "format": "date-time"}, "artifacts_expired": obj{"type": "boolean"}}},
		"Submission":      obj{"type": "object", "properties": obj{"id": stringType, "status": stringType, "replayed": obj{"type": "boolean"}, "reserved_credits": obj{"type": "integer"}}},
	}
	paths := obj{}
	response := func(description string, schema any) obj {
		return obj{"description": description, "content": obj{"application/json": obj{"schema": schema}}}
	}
	operation := func(summary string, status string, schema any) obj {
		return obj{"summary": summary, "responses": obj{status: response("Success", schema), "400": response("Invalid request", ref("Error")), "401": response("Authentication required", ref("Error")), "403": response("Verification or CSRF check required", ref("Error")), "422": response("Validation failed", ref("Error")), "429": response("Rate limit exceeded", ref("Error")), "500": response("Service error", ref("Error"))}}
	}
	parameter := func(name, where string, required bool, schema any) obj {
		return obj{"name": name, "in": where, "required": required, "schema": schema}
	}
	upload := operation("Upload a calibration, trial or reference clip", "201", ref("Media"))
	upload["requestBody"] = obj{"required": true, "content": obj{"multipart/form-data": obj{"schema": obj{"type": "object", "required": []string{"role", "file"}, "properties": obj{"role": obj{"type": "string", "enum": []string{"calibration", "main", "ground_truth"}}, "file": obj{"type": "string", "format": "binary"}}}}}}
	paths["/media"] = obj{"post": upload}
	paths["/media"].(obj)["get"] = operation("List active account-owned clips (maximum 20)", "200", obj{"type": "object", "properties": obj{"items": obj{"type": "array", "items": ref("Media")}}})
	submission := operation("Reserve one credit and queue an analysis", "202", ref("Submission"))
	submission["parameters"] = []any{parameter("Idempotency-Key", "header", false, obj{"type": "string", "maxLength": 128})}
	submission["requestBody"] = obj{"required": true, "content": obj{"application/json": obj{"schema": ref("AnalysisRequest")}}}
	submission["responses"].(obj)["200"] = response("Existing job returned for a repeated key", ref("Submission"))
	submission["responses"].(obj)["402"] = response("Insufficient available credits", ref("Error"))
	submission["responses"].(obj)["409"] = response("Key reused with different input", ref("Error"))
	list := operation("List account-owned analyses", "200", obj{"type": "object", "properties": obj{"items": obj{"type": "array", "items": ref("Analysis")}, "has_more": obj{"type": "boolean"}, "offset": obj{"type": "integer"}, "limit": obj{"type": "integer"}}})
	list["parameters"] = []any{parameter("limit", "query", false, obj{"type": "integer", "default": 20, "minimum": 1, "maximum": 100}), parameter("offset", "query", false, obj{"type": "integer", "default": 0, "minimum": 0})}
	paths["/analyses"] = obj{"post": submission, "get": list}
	get := operation("Get job status and completed scientific result", "200", ref("Analysis"))
	get["parameters"] = []any{parameter("id", "path", true, stringType)}
	get["responses"].(obj)["404"] = response("Analysis not found", ref("Error"))
	del := operation("Delete a completed analysis and its generated files", "200", obj{"type": "object"})
	del["parameters"] = get["parameters"]
	del["responses"].(obj)["409"] = response("Analysis still processing or unavailable", ref("Error"))
	paths["/analyses/{id}"] = obj{"get": get, "delete": del}
	paths["/jobs/{id}"] = obj{"get": get}
	mediaDel := operation("Delete an unused uploaded clip", "200", obj{"type": "object"})
	mediaDel["parameters"] = get["parameters"]
	paths["/media/{id}"] = obj{"delete": mediaDel}
	artifact := operation("Download private evidence files; clips support HTTP range requests", "200", obj{"type": "string", "format": "binary"})
	artifact["parameters"] = []any{parameter("id", "path", true, stringType), parameter("kind", "path", true, obj{"type": "string", "enum": []string{"result", "report", "predictions", "overlay", "visualization", "hidden_path_visualization", "bundle"}})}
	artifact["responses"].(obj)["200"] = obj{"description": "Evidence file", "content": obj{"application/octet-stream": obj{"schema": obj{"type": "string", "format": "binary"}}}}
	artifact["responses"].(obj)["410"] = response("Retention expired", ref("Error"))
	paths["/analyses/{id}/artifacts/{kind}"] = obj{"get": artifact}
	paths["/me"] = obj{"get": operation("Account, verification, balance and browser CSRF token", "200", obj{"type": "object"})}
	paths["/keys"] = obj{"get": operation("List API-key metadata", "200", obj{"type": "object"}), "post": operation("Create an API key; secret returned once", "201", obj{"type": "object"})}
	paths["/keys"].(obj)["post"].(obj)["requestBody"] = obj{"required": true, "content": obj{"application/json": obj{"schema": obj{"type": "object", "required": []string{"name"}, "properties": obj{"name": stringType}}}}}
	revoke := operation("Revoke an API key", "200", obj{"type": "object"})
	revoke["parameters"] = get["parameters"]
	paths["/keys/{id}"] = obj{"delete": revoke}
	paths["/billing"] = obj{"get": operation("Latest 100 credit ledger entries", "200", obj{"type": "object"})}
	checkout := operation("Create hosted Checkout for 100 credits at EUR 10", "200", obj{"type": "object", "properties": obj{"url": stringType}})
	checkout["responses"].(obj)["503"] = response("Stripe is unconfigured", ref("Error"))
	paths["/billing/checkout"] = obj{"post": checkout}
	for _, route := range []string{"health", "ready", "config"} {
		op := operation(route, "200", obj{"type": "object"})
		op["security"] = []any{}
		paths["/"+route] = obj{"get": op}
	}
	for _, route := range []string{"signup", "login", "verify", "forgot-password", "reset-password", "logout", "resend-verification"} {
		op := operation("Account "+route, "200", obj{"type": "object"})
		if route != "logout" && route != "resend-verification" {
			op["security"] = []any{}
			properties := obj{}
			required := []string{}
			switch route {
			case "signup", "login":
				properties = obj{"email": obj{"type": "string", "format": "email"}, "password": stringType}
				required = []string{"email", "password"}
			case "verify":
				properties = obj{"token": stringType}
				required = []string{"token"}
			case "forgot-password":
				properties = obj{"email": stringType}
				required = []string{"email"}
			case "reset-password":
				properties = obj{"token": stringType, "password": stringType}
				required = []string{"token", "password"}
			}
			op["requestBody"] = obj{"required": true, "content": obj{"application/json": obj{"schema": obj{"type": "object", "required": required, "properties": properties}}}}
		}
		if route == "signup" {
			op["responses"].(obj)["201"] = response("Account created; verification required", obj{"type": "object"})
		}
		paths["/auth/"+route] = obj{"post": op}
	}
	reply(w, 200, obj{"openapi": "3.1.0", "info": obj{"title": "Umbra public API", "version": "1.0.0", "description": "Experimental shadow-video analysis. Verify an account, upload clips, queue an analysis, poll its ID and download evidence. 120 authenticated requests per minute; two outstanding jobs per account. Default clip limit 250 MB; calibration 18 seconds, trial/reference 60 seconds. Files expire after 30 days. Browser mutations require X-CSRF-Token from /me; bearer keys do not."}, "servers": []any{obj{"url": s.Config.PublicURL + "/api/v1"}}, "security": []any{obj{"bearerAuth": []string{}}, obj{"cookieAuth": []string{}}}, "paths": paths, "components": obj{"schemas": schemas, "securitySchemes": obj{"bearerAuth": obj{"type": "http", "scheme": "bearer"}, "cookieAuth": obj{"type": "apiKey", "in": "cookie", "name": "umbra_session"}}}})
}

FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.26-alpine AS backend
WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /umbra ./cmd/umbra

FROM alpine:3.23
RUN apk add --no-cache ca-certificates tzdata && addgroup -g 10001 umbra && adduser -D -u 10001 -G umbra umbra && mkdir -p /app /data && chown umbra:umbra /app /data
WORKDIR /app
COPY --from=backend /umbra /app/umbra
COPY --from=frontend /build/frontend/dist /app/frontend
COPY backend/migrations/ /app/migrations/
USER umbra
EXPOSE 8000
ENTRYPOINT ["/app/umbra"]
CMD ["serve"]

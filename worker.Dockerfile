FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* && groupadd -g 10001 umbra && useradd -u 10001 -g umbra -m umbra && mkdir /data && chown umbra:umbra /data
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install --no-cache-dir .
USER umbra
ENV UMBRA_DATA_DIR=/data OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 8001
CMD ["uvicorn", "umbra.worker:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]

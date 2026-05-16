FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app ./app
COPY ./static ./static
COPY ./templates ./templates

EXPOSE 8000

CMD ["gunicorn", "app.main:app", \
     "-w", "2", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-b", "0.0.0.0:8000", \
     "--timeout", "60", \
     "--reload"]

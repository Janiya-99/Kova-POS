# syntax=docker/dockerfile:1
FROM golang:1.23-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/pos-api ./cmd/api

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata postgresql-client wget

COPY --from=builder /bin/pos-api /usr/local/bin/pos-api
COPY migrations ./migrations

EXPOSE 8080
CMD ["/usr/local/bin/pos-api"]


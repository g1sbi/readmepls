# ---- download stage ----
FROM alpine:3.20 AS download
ARG PB_VERSION=0.39.4
ARG TARGETARCH
RUN apk add --no-cache ca-certificates unzip wget
WORKDIR /dl
# Map Docker's TARGETARCH to PocketBase's release naming.
RUN case "$TARGETARCH" in \
      amd64) PB_ARCH=amd64 ;; \
      arm64) PB_ARCH=arm64 ;; \
      *) echo "unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac && \
    wget -q -O pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" && \
    unzip pb.zip && chmod +x pocketbase

# ---- runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && \
    addgroup -S pb && adduser -S pb -G pb
WORKDIR /pb
COPY --from=download /dl/pocketbase ./pocketbase
COPY pocketbase/pb_migrations /pb_migrations
COPY pocketbase/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    mkdir -p /pb_data && chown -R pb:pb /pb /pb_data /pb_migrations
USER pb
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

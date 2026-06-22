# ---- download stage ----
FROM alpine:3.20 AS download
ARG PB_VERSION=0.39.4
ARG TARGETARCH
RUN apk add --no-cache ca-certificates unzip wget
WORKDIR /dl
# Map Docker's TARGETARCH to PocketBase's release naming and pinned SHA256.
RUN case "$TARGETARCH" in \
      amd64) PB_ARCH=amd64 \
             PB_SHA=06a3ec70205b3eaf8343e226ab74c132013f7b1e9102e898dbca034bdd622d62 ;; \
      arm64) PB_ARCH=arm64 \
             PB_SHA=a03f3771e487174140e2360e3b7d0500618380cd3e338e4dc012f356ba5db5cf ;; \
      *) echo "unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac && \
    wget -q -O pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" && \
    echo "${PB_SHA}  pb.zip" | sha256sum -c - && \
    unzip pb.zip && chmod +x pocketbase

# ---- runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && \
    addgroup -S pb && adduser -S pb -G pb
WORKDIR /pb
COPY --from=download /dl/pocketbase ./pocketbase
COPY pocketbase/pb_migrations /pb_migrations
COPY pocketbase/pb_hooks /pb_hooks
COPY pocketbase/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    mkdir -p /pb_data && chown -R pb:pb /pb /pb_data /pb_migrations /pb_hooks
USER pb
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

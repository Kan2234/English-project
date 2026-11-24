# Build context is the project root; run `npm run build` first so dist/ exists.
FROM nginx:1.30.8-alpine

# Pull in Alpine security fixes released after the base image was built, and
# drop the optional dynamic modules (never loaded here) together with the
# libraries only they need (libxml2, libxslt, gd, geoip...): less attack surface.
RUN apk upgrade --no-cache \
 && apk del --no-cache nginx-module-acme nginx-module-geoip nginx-module-image-filter nginx-module-njs nginx-module-xslt \
 && rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/on-ta.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY dist/ /usr/share/nginx/html/

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/index.html || exit 1

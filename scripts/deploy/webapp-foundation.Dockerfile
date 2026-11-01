FROM openmf/web-app:dev@sha256:d071bea02ba0b83b0a9958f8ea651b7cc50aa86dd18f71ab304955e76bbd4b03
ENV NGINX_VERSION=1.31.7
COPY apks/ /opt/rf065-webapp-apks/
RUN --network=none cd /opt/rf065-webapp-apks \
    && printf '%s\n' \
       '9c82c86f051f3372445ecdbae5068ccc39dbc423ba8f779eaa84549fef1cfc77  libcrypto3-3.5.9-r0.apk' \
       'b5ad11f5955b3b7ddfd8c32e8c1fdd79878d208bb4dfa9bbd8f35ddc59187242  libssl3-3.5.9-r0.apk' \
       'd8057917531ed5eead1d4ccc8dd3ef630e4d90c0587e9b9feafe56c4f954265f  pcre2-10.49-r0.apk' \
       'ee62e1864c235901e2aa4d1868c7ae8f7cc5d0740a98c48a2525332eb4bfda73  zlib-1.3.2-r1.apk' \
       'eb705b8939f6e2250306358f37f6c4ac4282b8bd101986c5ecb4206a25d3af12  nginx-1.31.7-r1.apk' \
       | sha256sum -c - \
    && apk add --no-network --upgrade \
       ./libcrypto3-3.5.9-r0.apk ./libssl3-3.5.9-r0.apk ./pcre2-10.49-r0.apk ./zlib-1.3.2-r1.apk ./nginx-1.31.7-r1.apk
COPY --from=openmf/web-app:dev@sha256:d071bea02ba0b83b0a9958f8ea651b7cc50aa86dd18f71ab304955e76bbd4b03 /usr/share/nginx/html/ /usr/share/nginx/html/

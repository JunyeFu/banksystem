FROM openmf/fineract:develop@sha256:666c666900eb62fc1f6c5faa971e19c34ef6ec5d7cb8224276a49e2ddba262e1
USER root
RUN apk add --no-cache --repository https://repos.azul.com/zulu/alpine \
    zulu21-jdk=21.0.12.1-r1 openssl=3.5.9-r0 libcrypto3=3.5.9-r0 libssl3=3.5.9-r0 zlib=1.3.2-r1
COPY remove-files.txt /tmp/rf065-remove-files.txt
RUN while IFS= read -r jar; do rm -- "/app/libs/$jar"; done < /tmp/rf065-remove-files.txt \
    && rm /tmp/rf065-remove-files.txt
COPY libs/ /app/libs/
COPY jib-classpath-file /app/jib-classpath-file
COPY dependency-patch-manifest.json /app/rf065-dependency-patch-manifest.json
USER nobody:nogroup

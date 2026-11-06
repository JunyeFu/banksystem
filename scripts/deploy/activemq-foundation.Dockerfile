FROM eclipse-temurin:21.0.13_9-jre-noble@sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f
COPY packages/apt_2.8.4ubuntu0.1_amd64.deb /tmp/rf065-mq-packages/
COPY packages/libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb /tmp/rf065-mq-packages/
COPY packages/libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb /tmp/rf065-mq-packages/
COPY packages/ca-certificates_20260816ubuntu0.24.04.2_all.deb /tmp/rf065-mq-packages/
RUN --network=none test ! -d /run/systemd/system \
    && DEBIAN_FRONTEND=noninteractive dpkg -i \
    /tmp/rf065-mq-packages/libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb \
    /tmp/rf065-mq-packages/apt_2.8.4ubuntu0.1_amd64.deb \
    /tmp/rf065-mq-packages/libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb \
    /tmp/rf065-mq-packages/ca-certificates_20260816ubuntu0.24.04.2_all.deb \
    && dpkg --remove gnupg gpg keyboxd libsqlite3-0 \
    && dpkg --audit
ENV ACTIVEMQ_HOME=/opt/apache-activemq \
    ACTIVEMQ_BASE=/opt/apache-activemq \
    ACTIVEMQ_CONF=/opt/apache-activemq/conf \
    ACTIVEMQ_DATA=/opt/apache-activemq/data \
    PATH=/opt/apache-activemq/bin:$PATH
COPY apache-activemq-6.3.3/ /opt/apache-activemq/
COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
EXPOSE 61616 8161
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["activemq", "console"]

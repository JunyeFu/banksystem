FROM eclipse-temurin:21-jre-noble@sha256:000fd431958bc81a24abe1e8e5f0f0fd3ae365a594bd50aadb20696805f9408c
ENV ACTIVEMQ_HOME=/opt/apache-activemq \
    ACTIVEMQ_BASE=/opt/apache-activemq \
    ACTIVEMQ_CONF=/opt/apache-activemq/conf \
    ACTIVEMQ_DATA=/opt/apache-activemq/data \
    PATH=/opt/apache-activemq/bin:$PATH
COPY apache-activemq-6.2.10/ /opt/apache-activemq/
COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
EXPOSE 61616 8161
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["activemq", "console"]

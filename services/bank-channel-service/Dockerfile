FROM maven:3.9.9-eclipse-temurin-21@sha256:3a4ab3276a087bf276f79cae96b1af04f53731bec53fb2e651aca79e4b10211e AS maven-tools
FROM eclipse-temurin:21.0.13_9-jdk-noble@sha256:114cabb73033ca4ce7ceec3deb62396bc1b716282bae051ed3c1d82e38fcab2d AS dependencies
COPY --from=maven-tools /usr/share/maven /usr/share/maven
ENV MAVEN_HOME=/usr/share/maven
ENV PATH=/usr/share/maven/bin:$PATH
WORKDIR /src
COPY pom.xml .
RUN --mount=type=cache,id=banksystem-channel-maven-seeded,target=/root/.m2 mvn -q -DskipTests dependency:go-offline
FROM dependencies AS build
COPY src src
RUN --mount=type=cache,id=banksystem-channel-maven-seeded,target=/root/.m2 mvn -q -Dmaven.test.skip=true package
FROM eclipse-temurin:21.0.13_9-jre-noble@sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f
ADD --checksum=sha256:ad2ea7f107f250ba88b0bfdba31812a341e3247589647aa2b03b9dc4e8abf8ed https://security.ubuntu.com/ubuntu/pool/main/a/apt/apt_2.8.4ubuntu0.1_amd64.deb /tmp/rf065-channel-packages/apt_2.8.4ubuntu0.1_amd64.deb
ADD --checksum=sha256:a50f3e68a793f90b05f44a4b5f2f59f3ec7687e39b5d8bbd1da44c84671fa3d6 https://security.ubuntu.com/ubuntu/pool/main/a/apt/libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb /tmp/rf065-channel-packages/libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb
ADD --checksum=sha256:f41da7cb7e979d6b037ea92650c72ec8ec532ec3c93aa8d5b997207de56695ea https://security.ubuntu.com/ubuntu/pool/main/p/pcre2/libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb /tmp/rf065-channel-packages/libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb
ADD --checksum=sha256:f9fbacd417b515450b831032cc39d18059e9874e67525679a43c16071dabf9a0 https://archive.ubuntu.com/ubuntu/pool/main/c/ca-certificates/ca-certificates_20260816ubuntu0.24.04.2_all.deb /tmp/rf065-channel-packages/ca-certificates_20260816ubuntu0.24.04.2_all.deb
RUN --network=none test ! -d /run/systemd/system \
    && DEBIAN_FRONTEND=noninteractive dpkg -i \
    /tmp/rf065-channel-packages/libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb \
    /tmp/rf065-channel-packages/apt_2.8.4ubuntu0.1_amd64.deb \
    /tmp/rf065-channel-packages/libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb \
    /tmp/rf065-channel-packages/ca-certificates_20260816ubuntu0.24.04.2_all.deb \
    && dpkg --audit
WORKDIR /app
COPY --from=build /src/target/bank-channel-service-0.1.0.jar /app/app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

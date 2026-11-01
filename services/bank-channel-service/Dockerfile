FROM maven:3.9.9-eclipse-temurin-21@sha256:3a4ab3276a087bf276f79cae96b1af04f53731bec53fb2e651aca79e4b10211e AS dependencies
WORKDIR /src
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
FROM dependencies AS build
COPY src src
RUN --mount=type=cache,id=banksystem-channel-maven-seeded,from=dependencies,source=/root/.m2,target=/root/.m2 mvn -q -Dmaven.test.skip=true package
FROM eclipse-temurin:21-jre-noble@sha256:000fd431958bc81a24abe1e8e5f0f0fd3ae365a594bd50aadb20696805f9408c
WORKDIR /app
COPY --from=build /src/target/bank-channel-service-0.1.0.jar /app/app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

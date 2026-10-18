FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
ARG SERVICE_DIR=services/dentstaff
COPY services/pom.xml services/pom.xml
COPY ${SERVICE_DIR}/pom.xml ${SERVICE_DIR}/pom.xml
COPY ${SERVICE_DIR}/src ${SERVICE_DIR}/src
RUN mvn -B -f ${SERVICE_DIR}/pom.xml package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /work
ARG SERVICE_DIR=services/dentstaff
COPY --from=build /workspace/${SERVICE_DIR}/target/quarkus-app/ /work/quarkus-app/
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/work/quarkus-app/quarkus-run.jar"]

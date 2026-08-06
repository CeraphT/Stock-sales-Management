# Multi-stage build for the StockFlow / PharmaStock API (.NET 8).
# Build context is the REPO ROOT (see deploy/docker-compose.yml) because the API
# references the Domain + Infrastructure projects.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first (cached layer) — copy only the csproj files.
COPY src/PharmaStock.Domain/PharmaStock.Domain.csproj src/PharmaStock.Domain/
COPY src/PharmaStock.Infrastructure/PharmaStock.Infrastructure.csproj src/PharmaStock.Infrastructure/
COPY src/PharmaStock.Api/PharmaStock.Api.csproj src/PharmaStock.Api/
RUN dotnet restore src/PharmaStock.Api/PharmaStock.Api.csproj

# Then the sources + publish.
COPY src/ src/
RUN dotnet publish src/PharmaStock.Api/PharmaStock.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "PharmaStock.Api.dll"]

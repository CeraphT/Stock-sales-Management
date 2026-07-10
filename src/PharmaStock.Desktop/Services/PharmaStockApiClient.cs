using System.Net.Http.Json;
using System.Text.Json;
using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Services;

public record CreateCompanyRequest(
    string Name, string? Description, string Currency,
    string AdminName, string AdminPhone, string AdminPassword);
public record JoinCompanyRequest(string UniqueCode);
public record LoginRequest(string Phone, string Password);

public record CompanyResponse(Guid Id, string Name, string UniqueCode, string Currency, bool ServicesModuleEnabled);
public record UserResponse(Guid Id, string Name, string Phone, UserRole Role, bool Active);
public record LocationResponse(Guid Id, string Name, string? Address, bool Active);
public record AuthResponse(string Token, DateTime ExpiresAt, UserResponse User, Guid? CompanyId);
public record CreateCompanyResponse(CompanyResponse Company, AuthResponse Admin, LocationResponse DefaultLocation);

public class PharmaStockApiException : Exception
{
    public int StatusCode { get; }
    public PharmaStockApiException(int statusCode, string message) : base(message) => StatusCode = statusCode;
}

/// <summary>Thin wrapper over the PharmaStock.Api endpoints already built and
/// smoke-tested server-side (see the Api project's Services/*.cs). Talks to
/// the API over plain HTTP for now — this is the "online" path only; the
/// offline-first local SQLite store and sync queue (Section 6) are a
/// separate piece of work once these first screens are up and working.</summary>
public class PharmaStockApiClient
{
    private readonly HttpClient _http;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public PharmaStockApiClient(HttpClient http)
    {
        _http = http;
    }

    public Task<CreateCompanyResponse> CreateCompanyAsync(CreateCompanyRequest request, CancellationToken ct = default)
        => PostAsync<CreateCompanyRequest, CreateCompanyResponse>("/api/companies", request, ct);

    public Task<CompanyResponse> JoinCompanyAsync(string uniqueCode, CancellationToken ct = default)
        => PostAsync<JoinCompanyRequest, CompanyResponse>("/api/companies/join", new JoinCompanyRequest(uniqueCode), ct);

    public Task<AuthResponse> LoginAsync(string phone, string password, CancellationToken ct = default)
        => PostAsync<LoginRequest, AuthResponse>("/api/auth/login", new LoginRequest(phone, password), ct);

    private async Task<TResponse> PostAsync<TRequest, TResponse>(string url, TRequest body, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync(url, body, JsonOptions, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new PharmaStockApiException(0, "Could not reach the server. Check your connection and try again.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new PharmaStockApiException((int)response.StatusCode, ExtractMessage(errorBody));
        }

        var result = await response.Content.ReadFromJsonAsync<TResponse>(JsonOptions, ct);
        return result ?? throw new PharmaStockApiException((int)response.StatusCode, "Empty response from server.");
    }

    private static string ExtractMessage(string errorJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(errorJson);
            if (doc.RootElement.TryGetProperty("message", out var msg))
                return msg.GetString() ?? errorJson;
        }
        catch (JsonException)
        {
            // Not a JSON error body (e.g. a raw 401/403 with no content) — fall through.
        }
        return string.IsNullOrWhiteSpace(errorJson) ? "Request failed." : errorJson;
    }
}

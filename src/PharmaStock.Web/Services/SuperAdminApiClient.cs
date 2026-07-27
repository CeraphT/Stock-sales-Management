using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using PharmaStock.Domain.Models;
// PharmaStock.Domain.Models.DevicePlatform vs any ASP.NET-side ambiguity isn't
// a concern here (unlike the MAUI client, nothing else defines a
// "DevicePlatform" in this project's global usings), but the alias is kept
// for symmetry with PharmaStock.Desktop.Services.PharmaStockApiClient.cs.
using DevicePlatform = PharmaStock.Domain.Models.DevicePlatform;

namespace PharmaStock.Web.Services;

public record LoginRequest(string Phone, string Password, Guid DeviceId, string DeviceName, DevicePlatform Platform);
public record UserResponse(Guid Id, string Name, string Phone, UserRole Role, bool Active);
public record AuthResponse(string Token, DateTime ExpiresAt, string RefreshToken, Guid DeviceId, UserResponse User, Guid? CompanyId);

// Mirrors PharmaStock.Api.Services.SuperAdminEndpoints
public record SuperAdminCompanySummary(
    Guid Id, string Name, string UniqueCode, DateTime CreatedAt,
    int UserCount, int ProductCount, int SalesCount, decimal TotalRevenue);
public record SuperAdminCompanyUser(Guid Id, string Name, string Phone, UserRole Role, bool Active);
public record SuperAdminCompanyLocation(Guid Id, string Name, string? Address, bool Active);
public record SuperAdminCompanyDetail(
    Guid Id, string Name, string UniqueCode, DateTime CreatedAt,
    int UserCount, int ProductCount, int SalesCount, decimal TotalRevenue,
    List<SuperAdminCompanyUser> Users, List<SuperAdminCompanyLocation> Locations);

public record SuperAdminAccountResponse(Guid Id, string Name, string Phone, bool Active);
public record CreateSuperAdminRequest(string Name, string Phone, string Password);
public record SetSuperAdminActiveRequest(bool Active);

public class PharmaStockApiException : Exception
{
    public int StatusCode { get; }
    public PharmaStockApiException(int statusCode, string message) : base(message) => StatusCode = statusCode;
}

/// <summary>Thin server-side wrapper over the Api's SuperAdmin-only endpoints
/// (see PharmaStock.Api/Services/SuperAdminEndpoints.cs) plus the shared
/// login endpoint. Deliberately simpler than the MAUI client's
/// PharmaStockApiClient — no refresh-token rotation/retry for this v1 (a
/// SuperAdmin whose JWT expires mid-session just logs in again), and the
/// JWT never leaves this server process (SuperAdminSession holds it,
/// scoped to the Blazor circuit — see that file's doc comment).</summary>
public class SuperAdminApiClient
{
    private readonly HttpClient _http;
    private readonly SuperAdminSession _session;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public SuperAdminApiClient(HttpClient http, SuperAdminSession session)
    {
        _http = http;
        _session = session;
    }

    public Task<AuthResponse> LoginAsync(string phone, string password, CancellationToken ct = default)
        => PostAsync<LoginRequest, AuthResponse>(
            "/api/auth/login",
            new LoginRequest(phone, password, Guid.NewGuid(), "SuperAdmin Web", DevicePlatform.Web),
            authenticated: false, ct);

    public Task<List<SuperAdminCompanySummary>> GetCompaniesAsync(CancellationToken ct = default)
        => GetAsync<List<SuperAdminCompanySummary>>("/api/superadmin/companies", ct);

    public Task<SuperAdminCompanyDetail> GetCompanyDetailAsync(Guid id, CancellationToken ct = default)
        => GetAsync<SuperAdminCompanyDetail>($"/api/superadmin/companies/{id}", ct);

    public Task<List<SuperAdminAccountResponse>> GetAdminsAsync(CancellationToken ct = default)
        => GetAsync<List<SuperAdminAccountResponse>>("/api/superadmin/admins", ct);

    public Task<SuperAdminAccountResponse> CreateAdminAsync(string name, string phone, string password, CancellationToken ct = default)
        => PostAsync<CreateSuperAdminRequest, SuperAdminAccountResponse>(
            "/api/superadmin/admins", new CreateSuperAdminRequest(name, phone, password), authenticated: true, ct);

    public Task<SuperAdminAccountResponse> SetAdminActiveAsync(Guid id, bool active, CancellationToken ct = default)
        => PutAsync<SetSuperAdminActiveRequest, SuperAdminAccountResponse>(
            $"/api/superadmin/admins/{id}/active", new SetSuperAdminActiveRequest(active), ct);

    private Task<TResponse> GetAsync<TResponse>(string url, CancellationToken ct)
        => SendAsync<TResponse>(() => new HttpRequestMessage(HttpMethod.Get, url), authenticated: true, ct);

    private Task<TResponse> PostAsync<TRequest, TResponse>(string url, TRequest body, bool authenticated, CancellationToken ct)
        => SendAsync<TResponse>(() => new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        }, authenticated, ct);

    private Task<TResponse> PutAsync<TRequest, TResponse>(string url, TRequest body, CancellationToken ct)
        => SendAsync<TResponse>(() => new HttpRequestMessage(HttpMethod.Put, url)
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        }, authenticated: true, ct);

    private async Task<TResponse> SendAsync<TResponse>(Func<HttpRequestMessage> requestFactory, bool authenticated, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            var request = requestFactory();
            if (authenticated && _session.Token is { Length: > 0 } token)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            response = await _http.SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new PharmaStockApiException(0, "Impossible de joindre l'API PharmaStock. Vérifiez qu'elle est démarrée.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new PharmaStockApiException((int)response.StatusCode, ExtractMessage(errorBody));
        }

        var result = await response.Content.ReadFromJsonAsync<TResponse>(JsonOptions, ct);
        return result ?? throw new PharmaStockApiException((int)response.StatusCode, "Réponse vide du serveur.");
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
        return string.IsNullOrWhiteSpace(errorJson) ? "Échec de la requête." : errorJson;
    }
}

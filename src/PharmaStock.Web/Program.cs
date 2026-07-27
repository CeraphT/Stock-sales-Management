using PharmaStock.Web.Components;
using PharmaStock.Web.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// SuperAdminSession is Scoped — one instance per Blazor circuit (browser
// tab), holding the JWT for that session only. There's no ASP.NET Core
// cookie/HttpContext-based auth here: signing in just populates this
// service within the same circuit that later makes API calls, which sidesteps
// the well-known difficulty of calling HttpContext.SignInAsync from an
// already-interactive Blazor Server component (the response has already
// started by then). Trade-off: a browser refresh starts a fresh circuit and
// requires logging in again — acceptable for this v1 internal tool.
builder.Services.AddScoped<SuperAdminSession>();
builder.Services.AddHttpClient<SuperAdminApiClient>(client =>
{
    var baseUrl = builder.Configuration["PharmaStockApi:BaseUrl"] ?? "http://localhost:5080";
    client.BaseAddress = new Uri(baseUrl);
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();

app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();

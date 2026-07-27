namespace PharmaStock.Web.Services;

/// <summary>Holds the current SuperAdmin's JWT for the lifetime of their
/// Blazor Server circuit — registered Scoped, so it never survives past one
/// browser tab's connection and is never sent to the browser itself (Blazor
/// Server pages already run entirely on this process; only rendered HTML/DOM
/// diffs cross the wire). There's no ASP.NET Core cookie/HttpContext auth
/// involved — pages just check IsAuthenticated in OnInitializedAsync and
/// redirect to /login otherwise (see Program.cs's registration for why).</summary>
public class SuperAdminSession
{
    public string? Token { get; private set; }
    public string? UserName { get; private set; }
    public Guid? UserId { get; private set; }

    public bool IsAuthenticated => Token is { Length: > 0 };

    public void SignIn(string token, Guid userId, string userName)
    {
        Token = token;
        UserId = userId;
        UserName = userName;
    }

    public void SignOut()
    {
        Token = null;
        UserId = null;
        UserName = null;
    }
}

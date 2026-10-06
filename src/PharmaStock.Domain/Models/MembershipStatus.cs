namespace PharmaStock.Domain.Models;

/// <summary>Where a person stands in a business. Only Active grants a
/// shop-scoped session; Pending is a join-by-code request waiting for an admin.</summary>
public enum MembershipStatus
{
    Active,
    Pending,
    Rejected,
    Disabled
}

namespace PharmaStock.Domain.Models;

/// <summary>What kind of support request a user is filing. Serialized as an
/// integer over the wire — client enums must keep this order.</summary>
public enum SupportTicketCategory
{
    Bug,        // something doesn't work as expected
    Blocked,    // the user can't continue their work at all
    Question,   // how do I…? / feature request
}

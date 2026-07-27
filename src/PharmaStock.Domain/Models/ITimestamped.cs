namespace PharmaStock.Domain.Models;

/// <summary>Marks an entity as tracked for incremental sync pull (Section 6)
/// — UpdatedAt is stamped automatically on every insert/update by
/// TimestampSaveChangesInterceptor, never set by hand at call sites.</summary>
public interface ITimestamped
{
    DateTime UpdatedAt { get; set; }
}

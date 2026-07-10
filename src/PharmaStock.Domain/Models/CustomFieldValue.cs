namespace PharmaStock.Domain.Models;

/// <summary>One value of a custom field for one specific entity instance.
/// EntityId is a loose reference (not a foreign key) since it can point to
/// a Product, Customer, or Supplier depending on CustomFieldDefinition.EntityType.</summary>
public class CustomFieldValue
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CustomFieldDefinitionId { get; set; }
    public CustomFieldDefinition? CustomFieldDefinition { get; set; }

    public Guid EntityId { get; set; }
    public string? Value { get; set; }
}

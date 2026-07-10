namespace PharmaStock.Domain.Models;

/// <summary>Section 21.6 — an admin-defined custom field on a core entity
/// (Product, Customer, or Supplier). Purely additive: an entity with no
/// custom fields defined behaves exactly as already specified elsewhere.</summary>
public class CustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public CustomFieldEntityType EntityType { get; set; }
    public string FieldName { get; set; } = string.Empty;
    public CustomFieldType FieldType { get; set; }

    public ICollection<CustomFieldValue> Values { get; set; } = new List<CustomFieldValue>();
}

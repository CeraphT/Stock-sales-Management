using PharmaStock.Domain.Enums;

namespace PharmaStock.Domain.Entities;

/// <summary>Section 21.4 — a sale split into scheduled partial payments,
/// either Layaway (goods held until fully paid) or InstallmentCredit
/// (goods released immediately, balance collected over time).</summary>
public class InstallmentPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public decimal TotalAmount { get; set; }
    public int NumberOfInstallments { get; set; }
    public InstallmentMode Mode { get; set; }

    public ICollection<InstallmentPayment> Payments { get; set; } = new List<InstallmentPayment>();

    public decimal RemainingBalance => TotalAmount - Payments.Sum(p => p.AmountPaid);
    public bool IsFullyPaid => RemainingBalance <= 0;
}

public class InstallmentPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid InstallmentPlanId { get; set; }
    public InstallmentPlan? InstallmentPlan { get; set; }

    public decimal AmountPaid { get; set; }
    public DateTime DatePaid { get; set; } = DateTime.UtcNow;
}

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

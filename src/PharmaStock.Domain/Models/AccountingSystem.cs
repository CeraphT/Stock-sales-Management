namespace PharmaStock.Domain.Models;

/// <summary>Which accounting/tax framework a company's declarations follow.
/// Lets businesses outside the OHADA zone set up an applicable system with a
/// single choice instead of being locked to SYSCOHADA. The VAT math is shared;
/// only the declaration presentation (account codes, labels) and whether a tax
/// declaration exists at all differ per value.</summary>
public enum AccountingSystem
{
    /// <summary>OHADA / SYSCOHADA — the default for the Central/West-African
    /// market. TVA declaration with SYSCOHADA account codes (4431, 4452, 4441…).</summary>
    Ohada = 0,

    /// <summary>A generic VAT regime — same collected/deductible/due math and
    /// sales/purchase journals, but no OHADA account numbers or SYSCOHADA labels.</summary>
    GenericVat = 1,

    /// <summary>No sales tax at all — the tax declaration is hidden and reports
    /// omit VAT lines. For businesses that don't charge VAT.</summary>
    None = 2,
}

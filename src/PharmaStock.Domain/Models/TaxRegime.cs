namespace PharmaStock.Domain.Models;

/// <summary>Cameroon tax regime governing how a company is taxed on sales.</summary>
public enum TaxRegime
{
    /// <summary>Régime du réel / simplifié — collects TVA (VAT) on sales.</summary>
    Standard = 0,

    /// <summary>Impôt libératoire — a flat periodic lump-sum tax for very small
    /// businesses that replaces TVA; no VAT is charged on sales.</summary>
    FlatRate = 1,
}

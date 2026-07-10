namespace PharmaStock.Domain.Models;

public enum InstallmentMode
{
    Layaway,          // goods held back until fully paid
    InstallmentCredit // goods released immediately, balance collected over time
}

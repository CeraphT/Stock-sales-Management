namespace PharmaStock.Domain.Models;

public enum PaymentMethod
{
    Cash,
    MobileMoney,
    Credit,
    StoreCredit,
    GiftCard,
    Split // combination of the above, detail held in PaymentSplit
}

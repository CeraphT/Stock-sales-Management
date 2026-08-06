namespace PharmaStock.Domain.Models;

/// <summary>One component of an assembly's bill of materials: to build one unit
/// of the assembly product, <see cref="QuantityInBaseUnits"/> base units of the
/// component product are consumed. A "build" action FEFO-deducts these from the
/// component's stock and adds finished-goods stock of the assembly — so the rest
/// of the stock/sales engine treats the assembly as an ordinary product.</summary>
public class BillOfMaterialLine
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The product being built (its BOM owns this line).</summary>
    public Guid AssemblyProductId { get; set; }
    public Product? AssemblyProduct { get; set; }

    /// <summary>The component consumed when building the assembly.</summary>
    public Guid ComponentProductId { get; set; }
    public Product? ComponentProduct { get; set; }

    /// <summary>Base units of the component needed per one unit of the assembly.</summary>
    public int QuantityInBaseUnits { get; set; }
}

export interface ServiceStockLinkRequest {
  productId: string;
  quantityConsumedInBaseUnits: number;
}

export interface ServiceStockLinkResponse {
  productId: string;
  productName: string;
  quantityConsumedInBaseUnits: number;
}

export interface ServiceRequest {
  name: string;
  fixedPrice: number;
  category: string | null;
  stockLinks: ServiceStockLinkRequest[] | null;
}

export interface SetServiceActiveRequest {
  active: boolean;
}

export interface ServiceResponse {
  id: string;
  name: string;
  fixedPrice: number;
  category: string | null;
  active: boolean;
  stockLinks: ServiceStockLinkResponse[];
}

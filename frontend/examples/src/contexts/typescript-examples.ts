class ApiResponse<T> {
  data: T | null;
  message: string;
  statusCode: number;
  success: boolean;

  constructor(data: T | null, message: string, statusCode: number, success: boolean) {
    this.data = data;
    this.message = message;
    this.statusCode = statusCode;
    this.success = success;
  }
}

class User {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string, username: string, email: string, createdAt: Date, updatedAt: Date) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

class Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string, name: string, description: string, price: number, stock: number, createdAt: Date, updatedAt: Date) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.price = price;
    this.stock = stock;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

class Order {
  id: string;
  userId: string;
  products: { productId: string; quantity: number }[];
  totalAmount: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string, userId: string, products: { productId: string; quantity: number }[], totalAmount: number, status: 'pending' | 'completed' | 'cancelled', createdAt: Date, updatedAt: Date) {
    this.id = id;
    this.userId = userId;
    this.products = products;
    this.totalAmount = totalAmount;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export { ApiResponse, User, Product, Order };
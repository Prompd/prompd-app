# Extracted Context Files

## Context from typescript-examples.ts

# typescript-examples.ts

```typescript
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
```

## Context from code-review-checklist.md

# code-review-checklist.md

# Code Review Checklist

## Functionality
- [ ] Code implements the required functionality
- [ ] Edge cases are handled properly
- [ ] Error conditions are managed gracefully
- [ ] Business logic is correct and complete

## Code Quality
- [ ] Code is readable and well-organized
- [ ] Functions/methods have single responsibility
- [ ] Variable and function names are clear and descriptive
- [ ] No duplicate code (DRY principle)
- [ ] Appropriate use of design patterns

## Security
- [ ] Input validation is comprehensive
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Sensitive data is properly handled
- [ ] Authentication and authorization are correct
- [ ] No secrets in code

## Performance
- [ ] No obvious performance bottlenecks
- [ ] Database queries are optimized
- [ ] Appropriate use of caching
- [ ] No N+1 query problems
- [ ] Resource cleanup (connections, files, etc.)

## Testing
- [ ] Unit tests cover new code
- [ ] Tests cover edge cases
- [ ] Tests are maintainable and clear
- [ ] Integration tests where appropriate
- [ ] Test coverage meets requirements

## Documentation
- [ ] Public APIs are documented
- [ ] Complex logic has explanatory comments
- [ ] README updated if needed
- [ ] Breaking changes are noted
- [ ] Migration guide provided if needed

## Dependencies
- [ ] New dependencies are justified
- [ ] Dependencies are up to date
- [ ] No security vulnerabilities in dependencies
- [ ] License compatibility checked

## Best Practices
- [ ] Follows language idioms and conventions
- [ ] Follows project coding standards
- [ ] Appropriate error logging
- [ ] Configuration is externalized
- [ ] Backward compatibility maintained

# Code Assistant

## Role
You are an expert software developer proficient in typescript and modern development practices.

## Task Mode: implement
### Implementation Guidelines
- Write clean, readable code following typescript conventions
- Include error handling and edge cases
- Add inline comments for complex logic
- Follow SOLID principles and design patterns

## Language-Specific Best Practices
- Use strict type checking
- Leverage TypeScript's type system effectively
- Prefer interfaces over types for object shapes
- Use generics for reusable components

## Testing
Include comprehensive tests:
- Unit tests for individual functions
- Test edge cases and error conditions
- Use appropriate testing framework for typescript
- Maintain high test coverage

## Output Format
Provide well-structured code with:
- Clear function/class names
- Appropriate error handling
- Concise documentation
- Usage examples where helpful
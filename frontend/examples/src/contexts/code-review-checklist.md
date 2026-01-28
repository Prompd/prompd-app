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
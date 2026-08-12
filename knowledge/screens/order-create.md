# Screen Spec: ORDER_CREATE

## Fields

- Customer: required text input.
- Product: required product selector populated from GET /api/products.
- Quantity: required integer input. Screen copy states accepted range is 1 to 100.
- Delivery date: required date input. Date before today is not allowed.

## Success state

When all confirmed rules are satisfied, the page shows `Order created`.

## Error state

When a field violates a confirmed rule, the page shows a field-level validation message.

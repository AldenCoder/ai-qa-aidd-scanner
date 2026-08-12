# Demo Order Rules

## BR-01 Quantity
Status: CONFIRMED
Condition: Quantity must be an integer between 1 and 100 inclusive.
Boundary: 0, 1, 100, 101
Expected positive: Order is accepted when quantity is 1 or 100 and all other fields are valid.
Expected negative: Order is rejected when quantity is below 1 or above 100.

## BR-02 Customer
Status: CONFIRMED
Condition: Customer is required and must not be blank.
Expected negative: Order is rejected when customer is blank.

## BR-03 Product
Status: CONFIRMED
Condition: Product ID must exist in GET /api/products.
Expected negative: Order is rejected when product ID is unknown.

## BR-04 Delivery Date
Status: CONFIRMED
Condition: Delivery date must be today or a future date.
Boundary: yesterday, today
Expected negative: Order is rejected when delivery date is before today.

## BR-05 Maximum Total Order Value
Status: MISSING
Condition: Maximum total order value is referenced by stakeholders, but no approved limit is defined.
Expected result: MISSING

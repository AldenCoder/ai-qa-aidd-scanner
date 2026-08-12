# API Spec: Orders

## GET /api/products

Returns the list of valid products.

## POST /api/orders

Creates an order if:

- Customer is not blank.
- Product ID exists in GET /api/products.
- Quantity is an integer from 1 to 100 inclusive.
- Delivery date is today or later.

Invalid data returns HTTP 400 with an `errors` array.

## GET /api/orders/{id}

Returns HTTP 200 for an existing order and HTTP 404 for an unknown order ID.

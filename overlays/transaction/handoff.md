# Transaction overlay

Use this when the launch type intent is `transaction`.

First useful shape:

- show a small published product list from `public-products`;
- use `/api/product-inquiries` as the temporary intent-capture endpoint;
- do not build cart, payment, inventory, accounts, or admin flows until
  the user asks for them.

Move to real checkout only after the blank site deploy and first product
surface are working.

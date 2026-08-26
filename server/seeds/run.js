require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  console.log('Starting database seeding...');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'atchaar_pos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();

  try {
    // Check if data already seeded
    const userCheck = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count) > 0) {
      console.log('Database already has data. Skipping seed.');
      return;
    }

    await client.query('BEGIN');

    // ── USERS ─────────────────────────────────────────────────────────────────
    const adminHash = await bcrypt.hash('admin123', 10);
    const cashierHash = await bcrypt.hash('cashier123', 10);

    await client.query(`
      INSERT INTO users (name, email, password_hash, role) VALUES
      ('Admin User', 'admin@selaizaa.co.ls', $1, 'admin'),
      ('Jane Cashier', 'cashier@selaizaa.co.ls', $2, 'cashier')
    `, [adminHash, cashierHash]);
    console.log('[OK] Users seeded');

    // ── CATEGORIES ────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO categories (name, description) VALUES
      ('Fresh Achaar', 'Selaizaa Premium fresh achaar in various sizes'),
      ('Chutneys', 'Sweet and spicy chutneys made from fresh fruits and vegetables'),
      ('Sauces', 'Hot sauces and cooking sauces')
    `);
    console.log('[OK] Categories seeded');

    const catResult = await client.query('SELECT id, name FROM categories ORDER BY id');
    const cats = {};
    catResult.rows.forEach(r => { cats[r.name] = r.id; });

    // ── SUPPLIERS ─────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
      ('Lesotho Pickle Co.', 'Thabo Mokoena', '+26622001234', 'thabo@lspickle.co.ls', '12 Industrial Road, Maseru, Lesotho'),
      ('Spice Masters SA', 'Priya Naidoo', '+27114567890', 'priya@spicemasters.co.za', '45 Spice Street, Johannesburg, South Africa'),
      ('Local Farmers Co-op', 'Nthabiseng Letsie', '+26627009876', 'coop@lfc.co.ls', 'Ha Thetsane, Maseru, Lesotho')
    `);
    console.log('[OK] Suppliers seeded');

    // ── PRODUCTS ──────────────────────────────────────────────────────────────
    const products = [
      {
        name: 'Selaizaa Fresh Achaar',
        description: 'Selaizaa Premium fresh achaar — Tatso e fumanehang Lai Lai. Available in mild flavour across a range of sizes.',
        category: 'Fresh Achaar',
        variants: [
          { flavor: 'Mild', size: '90ml',  price: 7.00,   cost: 3.00,   sku: 'SLA-90',   barcode: '6002660000001', stock: 200 },
          { flavor: 'Mild', size: '125ml', price: 13.00,  cost: 5.00,   sku: 'SLA-125',  barcode: '6002660000002', stock: 200 },
          { flavor: 'Mild', size: '200ml', price: 16.00,  cost: 7.00,   sku: 'SLA-200',  barcode: '6002660000003', stock: 150 },
          { flavor: 'Mild', size: '250ml', price: 23.00,  cost: 10.00,  sku: 'SLA-250',  barcode: '6002660000004', stock: 150 },
          { flavor: 'Mild', size: '300ml', price: 35.00,  cost: 15.00,  sku: 'SLA-300',  barcode: '6002660000005', stock: 120 },
          { flavor: 'Mild', size: '1L',    price: 60.00,  cost: 26.00,  sku: 'SLA-1L',   barcode: '6002660000006', stock: 80 },
          { flavor: 'Mild', size: '2L',    price: 90.00,  cost: 38.00,  sku: 'SLA-2L',   barcode: '6002660000007', stock: 50 },
          { flavor: 'Mild', size: '5L',    price: 200.00, cost: 85.00,  sku: 'SLA-5L',   barcode: '6002660000008', stock: 30 }
        ]
      }
    ];

    for (const product of products) {
      const pResult = await client.query(
        'INSERT INTO products (name, description, category_id) VALUES ($1, $2, $3) RETURNING id',
        [product.name, product.description, cats[product.category]]
      );
      const productId = pResult.rows[0].id;

      for (const variant of product.variants) {
        const vResult = await client.query(
          `INSERT INTO product_variants (product_id, sku, barcode, flavor, size, price, cost_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [productId, variant.sku, variant.barcode, variant.flavor, variant.size, variant.price, variant.cost]
        );
        const variantId = vResult.rows[0].id;

        await client.query(
          'INSERT INTO inventory (variant_id, quantity, low_stock_threshold) VALUES ($1, $2, $3)',
          [variantId, variant.stock, 10]
        );
      }
    }
    console.log('[OK] Products, variants, and inventory seeded');

    // ── CUSTOMERS ─────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO customers (name, email, phone, address, loyalty_points, loyalty_tier, total_spent) VALUES
      ('Lerato Molefe', 'lerato.molefe@gmail.com', '+26657001234', '15 Kingsway, Maseru', 2500, 'Silver', 2500.00),
      ('Thabiso Nkosi', 'thabiso.nkosi@yahoo.com', '+26622456789', '8 Main North Road, Teyateyaneng', 750, 'Bronze', 750.00),
      ('Palesa Dlamini', 'palesa.d@outlook.com', '+26627889900', '3 Constitution Road, Maseru', 6200, 'Gold', 6200.00),
      ('Mpho Letsie', null, '+26658112233', null, 300, 'Bronze', 300.00),
      ('Refiloe Makara', 'refiloe.m@gmail.com', '+26622334455', '22 Airport Road, Maseru', 1200, 'Silver', 1200.00)
    `);
    console.log('[OK] Customers seeded');

    await client.query('COMMIT');
    console.log('\nDatabase seeding completed successfully!');
    console.log('\nLogin credentials:');
    console.log('  Admin:   admin@selaizaa.co.ls   / admin123');
    console.log('  Cashier: cashier@selaizaa.co.ls / cashier123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase().catch(err => {
  console.error('Seed script error:', err.message);
  process.exit(1);
});

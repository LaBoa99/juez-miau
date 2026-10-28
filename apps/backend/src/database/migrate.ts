import dataSource from './data-source.js'

// node dist/database/migrate.js           aplica las migraciones pendientes
// node dist/database/migrate.js baseline  marca todas como aplicadas sin ejecutarlas: solo para
//                                         una BD creada con DB_SYNCHRONIZE=true que ya tiene el esquema
async function main() {
    const baseline = process.argv[2] === 'baseline'
    await dataSource.initialize()
    try {
        const applied = await dataSource.runMigrations({ transaction: 'each', fake: baseline })
        const verb = baseline ? 'marked as applied' : 'applied'
        console.log(applied.length ? verb + ': ' + applied.map((migration) => migration.name).join(', ') : 'no pending migrations')
    } finally {
        await dataSource.destroy()
    }
}

await main()

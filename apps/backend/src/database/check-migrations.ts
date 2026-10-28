import { createDataSource } from './data-source.js'

// pnpm migration:check — falla si una entidad cambió sin su migración.
// En desarrollo DB_SYNCHRONIZE=true esconde el olvido (la BD se ajusta sola); aquí se arma una BD
// vacía solo con las migraciones y se compara con las entidades. Necesita permiso de CREATE DATABASE
async function main() {
    const admin = createDataSource()
    const scratch = admin.options.database + '_migration_check'
    await admin.initialize()
    await admin.query(`DROP DATABASE IF EXISTS "${scratch}"`)
    await admin.query(`CREATE DATABASE "${scratch}"`)

    let missing: string[] = []
    const check = createDataSource(scratch)
    try {
        await check.initialize()
        await check.runMigrations({ transaction: 'each' })
        missing = (await check.driver.createSchemaBuilder().log()).upQueries.map((query) => query.query)
    } finally {
        if(check.isInitialized) await check.destroy()
        await admin.query(`DROP DATABASE IF EXISTS "${scratch}"`)
        await admin.destroy()
    }

    if(missing.length > 0){
        console.error('the entities need changes that no migration makes:\n' + missing.join(';\n'))
        console.error('\ngenerate one: pnpm migration:generate src/database/migrations/<Name>')
        process.exit(1)
    }
    console.log('migrations match the entities')
}

await main()

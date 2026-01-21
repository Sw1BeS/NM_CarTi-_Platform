/**
 * Production Normalization Data Seeds
 * Automotive brands, models, and Ukrainian cities for data quality
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Top automotive brands with Ukrainian translations
const BRANDS = [
    // German Premium
    { alias: 'BMW', canonical: 'BMW', variants: ['БМВ', 'бмв'] },
    { alias: 'Mercedes-Benz', canonical: 'Mercedes-Benz', variants: ['Mercedes', 'Мерседес', 'Бенц'] },
    { alias: 'Audi', canonical: 'Audi', variants: ['Ауді', 'ауди'] },
    { alias: 'Volkswagen', canonical: 'Volkswagen', variants: ['VW', 'Фольксваген', 'фольцваген'] },
    { alias: 'Porsche', canonical: 'Porsche', variants: ['Порше'] },

    // Japanese
    { alias: 'Toyota', canonical: 'Toyota', variants: ['Тойота', 'тойота'] },
    { alias: 'Lexus', canonical: 'Lexus', variants: ['Лексус'] },
    { alias: 'Honda', canonical: 'Honda', variants: ['Хонда'] },
    { alias: 'Nissan', canonical: 'Nissan', variants: ['Ніссан', 'ниссан'] },
    { alias: 'Mazda', canonical: 'Mazda', variants: ['Мазда'] },
    { alias: 'Subaru', canonical: 'Subaru', variants: ['Субару'] },
    { alias: 'Mitsubishi', canonical: 'Mitsubishi', variants: ['Мітсубісі', 'митсубиси'] },

    // Korean
    { alias: 'Hyundai', canonical: 'Hyundai', variants: ['Хюндай', 'хундай'] },
    { alias: 'Kia', canonical: 'Kia', variants: ['Кіа', 'киа'] },
    { alias: 'Genesis', canonical: 'Genesis', variants: ['Дженезіс'] },

    // American
    { alias: 'Ford', canonical: 'Ford', variants: ['Форд'] },
    { alias: 'Chevrolet', canonical: 'Chevrolet', variants: ['Шевроле', 'Chevy'] },
    { alias: 'Tesla', canonical: 'Tesla', variants: ['Тесла'] },
    { alias: 'Jeep', canonical: 'Jeep', variants: ['Джип'] },
    { alias: 'Dodge', canonical: 'Dodge', variants: ['Додж'] },

    // European
    { alias: 'Renault', canonical: 'Renault', variants: ['Рено'] },
    { alias: 'Peugeot', canonical: 'Peugeot', variants: ['Пежо'] },
    { alias: 'Citroen', canonical: 'Citroen', variants: ['Сітроен'] },
    { alias: 'Skoda', canonical: 'Skoda', variants: ['Шкода'] },
    { alias: 'Volvo', canonical: 'Volvo', variants: ['Вольво'] },
    { alias: 'Land Rover', canonical: 'Land Rover', variants: ['Ленд Ровер', 'Range Rover'] },
    { alias: 'Jaguar', canonical: 'Jaguar', variants: ['Ягуар'] },
    { alias: 'MINI', canonical: 'MINI', variants: ['Міні', 'mini'] },
    { alias: 'Fiat', canonical: 'Fiat', variants: ['Фіат'] },
    { alias: 'Alfa Romeo', canonical: 'Alfa Romeo', variants: ['Альфа Ромео'] }
];

// Popular models (sample - can be expanded)
const MODELS = [
    // BMW
    { brand: 'BMW', model: '3 Series', variants: ['320', '330', '340', 'M3'] },
    { brand: 'BMW', model: '5 Series', variants: ['520', '530', '540', 'M5'] },
    { brand: 'BMW', model: 'X5', variants: [] },
    { brand: 'BMW', model: 'X3', variants: [] },

    // Mercedes-Benz
    { brand: 'Mercedes-Benz', model: 'C-Class', variants: ['C200', 'C220', 'C300', 'C63 AMG'] },
    { brand: 'Mercedes-Benz', model: 'E-Class', variants: ['E200', 'E220', 'E300'] },
    { brand: 'Mercedes-Benz', model: 'GLE', variants: [] },
    { brand: 'Mercedes-Benz', model: 'GLC', variants: [] },

    // Audi
    { brand: 'Audi', model: 'A4', variants: [] },
    { brand: 'Audi', model: 'A6', variants: [] },
    { brand: 'Audi', model: 'Q5', variants: [] },
    { brand: 'Audi', model: 'Q7', variants: [] },

    // Toyota
    { brand: 'Toyota', model: 'Camry', variants: [] },
    { brand: 'Toyota', model: 'RAV4', variants: [] },
    { brand: 'Toyota', model: 'Land Cruiser', variants: ['Prado', 'LC200'] },
    { brand: 'Toyota', model: 'Corolla', variants: [] }
];

// Major Ukrainian cities
const CITIES = [
    { alias: 'Kyiv', canonical: 'Kyiv', variants: ['Київ', 'Киев', 'Kiev'] },
    { alias: 'Lviv', canonical: 'Lviv', variants: ['Львів', 'Львов'] },
    { alias: 'Odesa', canonical: 'Odesa', variants: ['Одеса', 'Одесса', 'Odessa'] },
    { alias: 'Dnipro', canonical: 'Dnipro', variants: ['Дніпро', 'Днепр', 'Dnipropetrovsk'] },
    { alias: 'Kharkiv', canonical: 'Kharkiv', variants: ['Харків', 'Харьков'] },
    { alias: 'Zaporizhzhia', canonical: 'Zaporizhzhia', variants: ['Запоріжжя', 'Запорожье'] },
    { alias: 'Vinnytsia', canonical: 'Vinnytsia', variants: ['Вінниця', 'Винница'] },
    { alias: 'Poltava', canonical: 'Poltava', variants: ['Полтава'] },
    { alias: 'Ivano-Frankivsk', canonical: 'Ivano-Frankivsk', variants: ['Івано-Франківськ'] },
    { alias: 'Ternopil', canonical: 'Ternopil', variants: ['Тернопіль'] },
    { alias: 'Lutsk', canonical: 'Lutsk', variants: ['Луцьк'] },
    { alias: 'Chernivtsi', canonical: 'Chernivtsi', variants: ['Чернівці'] },
    { alias: 'Rivne', canonical: 'Rivne', variants: ['Рівне'] },
    { alias: 'Zhytomyr', canonical: 'Zhytomyr', variants: ['Житомир'] },
    { alias: 'Cherkasy', canonical: 'Cherkasy', variants: ['Черкаси'] }
];

export async function seedProductionNormalization(companyId: string) {
    console.log('🧭 Seeding production normalization data...');

    // Seed brands
    let brandCount = 0;
    for (const brand of BRANDS) {
        // Main brand name
        await prisma.normalizationAlias.upsert({
            where: {
                type_alias_companyId: {
                    type: 'brand',
                    alias: brand.alias,
                    companyId
                }
            },
            create: {
                type: 'brand',
                alias: brand.alias,
                canonical: brand.canonical,
                companyId
            },
            update: { canonical: brand.canonical }
        });
        brandCount++;

        // Variants
        for (const variant of brand.variants) {
            await prisma.normalizationAlias.upsert({
                where: {
                    type_alias_companyId: {
                        type: 'brand',
                        alias: variant,
                        companyId
                    }
                },
                create: {
                    type: 'brand',
                    alias: variant,
                    canonical: brand.canonical,
                    companyId
                },
                update: { canonical: brand.canonical }
            });
            brandCount++;
        }
    }
    console.log(`   ✅ Brands: ${brandCount} aliases`);

    // Seed models
    let modelCount = 0;
    for (const model of MODELS) {
        await prisma.normalizationAlias.upsert({
            where: {
                type_alias_companyId: {
                    type: 'model',
                    alias: model.model,
                    companyId
                }
            },
            create: {
                type: 'model',
                alias: model.model,
                canonical: model.model,
                companyId
            },
            update: { canonical: model.model }
        });
        modelCount++;
    }
    console.log(`   ✅ Models: ${modelCount} aliases`);

    // Seed cities
    let cityCount = 0;
    for (const city of CITIES) {
        // Main city name
        await prisma.normalizationAlias.upsert({
            where: {
                type_alias_companyId: {
                    type: 'city',
                    alias: city.alias,
                    companyId
                }
            },
            create: {
                type: 'city',
                alias: city.alias,
                canonical: city.canonical,
                companyId
            },
            update: { canonical: city.canonical }
        });
        cityCount++;

        // Variants
        for (const variant of city.variants) {
            await prisma.normalizationAlias.upsert({
                where: {
                    type_alias_companyId: {
                        type: 'city',
                        alias: variant,
                        companyId
                    }
                },
                create: {
                    type: 'city',
                    alias: variant,
                    canonical: city.canonical,
                    companyId
                },
                update: { canonical: city.canonical }
            });
            cityCount++;
        }
    }
    console.log(`   ✅ Cities: ${cityCount} aliases`);

    console.log('✅ Production normalization data seeded');
}



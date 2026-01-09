
export interface CarBrand {
    name: string;
    models: string[];
}

export const CAR_DB: CarBrand[] = [
    {
        name: "BMW",
        models: ["3 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X6", "X7", "M3", "M4", "M5", "i4", "iX"]
    },
    {
        name: "Mercedes-Benz",
        models: ["C-Class", "E-Class", "S-Class", "G-Class", "GLE", "GLS", "GLC", "A-Class", "CLA", "EQE", "EQS"]
    },
    {
        name: "Audi",
        models: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "RS6", "RS Q8", "e-tron GT"]
    },
    {
        name: "Porsche",
        models: ["911", "Cayenne", "Macan", "Panamera", "Taycan", "718 Cayman", "718 Boxster"]
    },
    {
        name: "Tesla",
        models: ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"]
    },
    {
        name: "Land Rover",
        models: ["Range Rover", "Range Rover Sport", "Range Rover Velar", "Defender", "Discovery"]
    },
    {
        name: "Toyota",
        models: ["Camry", "Corolla", "RAV4", "Land Cruiser 300", "Land Cruiser Prado", "Highlander", "Hilux"]
    },
    {
        name: "Volkswagen",
        models: ["Golf", "Passat", "Tiguan", "Touareg", "Arteon", "ID.4", "ID.Buzz"]
    },
    {
        name: "Lexus",
        models: ["ES", "LS", "NX", "RX", "LX", "GX"]
    },
    {
        name: "Lamborghini",
        models: ["Urus", "Huracan", "Revuelto"]
    }
];

export const getCarTitle = (brand: string, model: string, year?: number) => {
    return `${brand} ${model} ${year ? year : ''}`.trim();
};

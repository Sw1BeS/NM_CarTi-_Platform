export const CAR_MAKES = [
    'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Bentley', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler',
    'Citroen', 'Dodge', 'Ferrari', 'Fiat', 'Ford', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar',
    'Jeep', 'Kia', 'Lamborghini', 'Land Rover', 'Lexus', 'Lincoln', 'Maserati', 'Mazda', 'McLaren',
    'Mercedes', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Rolls-Royce',
    'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo', 'Zeekr', 'Li Auto', 'Lixiang'
];

export const detectMake = (text: string): string | null => {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Sort by length desc to match "Mercedes-Benz" before "Mercedes"
    const sorted = [...CAR_MAKES].sort((a, b) => b.length - a.length);

    for (const make of sorted) {
        // Look for word boundary or start of string
        const regex = new RegExp(`\\b${make.replace('-', '[- ]?')}\\b`, 'i');
        if (regex.test(text)) {
            return make;
        }
    }
    return null;
};

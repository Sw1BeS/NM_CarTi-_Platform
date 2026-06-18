export const CAR_MAKES = [
    'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Bentley', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler',
    'Citroen', 'Dodge', 'Ferrari', 'Fiat', 'Ford', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar',
    'Jeep', 'Kia', 'Lamborghini', 'Land Rover', 'Lexus', 'Lincoln', 'Maserati', 'Mazda', 'McLaren',
    'Mercedes', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Rolls-Royce',
    'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo', 'Zeekr', 'Li Auto', 'Lixiang'
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const makePattern = (make: string) =>
    make.split(/[-\s]+/).filter(Boolean).map(escapeRegex).join('[ -]+');

export const detectMakeFromKnownList = (text: string, makes: string[]): string | null => {
    if (!text) return null;

    const sorted = [...makes].filter(Boolean).sort((a, b) => b.length - a.length);

    for (const make of sorted) {
        const regex = new RegExp(`\\b${makePattern(make)}\\b`, 'i');
        if (regex.test(text)) {
            return make;
        }
    }
    return null;
};

export const detectMake = (text: string): string | null => detectMakeFromKnownList(text, CAR_MAKES);

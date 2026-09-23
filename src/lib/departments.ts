export const ALL_DEPARTMENTS = [
    'Outsourcing',
    'IT',
    'Sales',
    'Marketing',
    'Recruitment',
    'Human Resources',
    'Account',
    'Operation (Management)'
] as const;

export type Department = (typeof ALL_DEPARTMENTS)[number];

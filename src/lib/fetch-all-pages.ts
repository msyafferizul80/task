type PageableQuery<T> = {
    range: (
        from: number,
        to: number
    ) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

type CountedPageableQuery<T> = {
    range: (
        from: number,
        to: number
    ) => PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>;
};

export async function fetchTaskPage<T>(
    query: CountedPageableQuery<T>,
    page: number,
    pageSize: number
): Promise<{ rows: T[]; total: number }> {
    const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;
    return { rows: data || [], total: count || 0 };
}

export async function fetchAllPages<T>(query: PageableQuery<T>, pageSize = 1000): Promise<T[]> {
    const rows: T[] = [];

    for (let from = 0; ; from += pageSize) {
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;

        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

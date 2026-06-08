import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
    try {
        console.log('Triggering sync from PHP endpoint...');

        const response = await fetch('https://syazna-world-app.xo.je/rcs-0.7/function/trigger-sync.php', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.text();
        console.log('Sync triggered successfully! Result:', result);

        return new Response(JSON.stringify({
            success: true,
            message: 'Sync triggered successfully',
            result
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (error) {
        console.error('Error triggering sync:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
});

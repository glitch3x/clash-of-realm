use bolt_lang::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub module solana_kingdom {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    /// System: MarchSystem
    /// Moves an army entity towards a target position based on map ticks.
    pub fn march_system(ctx: Context<MarchSystemContext>, target_x: u16, target_y: u16) -> Result<()> {
        let position = &mut ctx.accounts.position;
        
        // Simplified movement logic: advance 1 tile per tick towards target
        if position.x < target_x { position.x += 1; }
        else if position.x > target_x { position.x -= 1; }
        
        if position.y < target_y { position.y += 1; }
        else if position.y > target_y { position.y -= 1; }
        
        msg!("Army marched to new position: ({}, {})", position.x, position.y);
        Ok(())
    }

    /// System: CombatSystem
    /// Calculates casualties when two armies are on the same tile.
    pub fn combat_system(ctx: Context<CombatSystemContext>) -> Result<()> {
        let attacker = &mut ctx.accounts.attacker_army;
        let defender = &mut ctx.accounts.defender_army;

        // Simple combat resolution based on unit counts
        let attacker_power = attacker.infantry + attacker.archers + (attacker.cavalry * 2);
        let defender_power = defender.infantry + defender.archers + (defender.cavalry * 2);

        if attacker_power > defender_power {
            msg!("Attacker wins! Defender wiped out.");
            defender.infantry = 0;
            defender.archers = 0;
            defender.cavalry = 0;
            
            // Attacker loses 10% of troops
            attacker.infantry = (attacker.infantry as f64 * 0.9) as u32;
        } else {
            msg!("Defender holds! Attacker repelled.");
            attacker.infantry = 0;
            attacker.archers = 0;
            attacker.cavalry = 0;
        }
        
        Ok(())
    }
}

// ---------------------------------------
// ECS Components
// ---------------------------------------

#[component]
#[derive(Default)]
pub struct Position {
    pub x: u16,
    pub y: u16,
}

#[component]
#[derive(Default)]
pub struct Resources {
    pub wood: u64,
    pub stone: u64,
    pub gold: u64,
}

#[component]
#[derive(Default)]
pub struct ArmyUnits {
    pub infantry: u32,
    pub archers: u32,
    pub cavalry: u32,
}

// ---------------------------------------
// Contexts
// ---------------------------------------

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct MarchSystemContext<'info> {
    #[component]
    pub position: Account<'info, Position>,
    // Army units component must exist to march
    #[component]
    pub army: Account<'info, ArmyUnits>,
}

#[derive(Accounts)]
pub struct CombatSystemContext<'info> {
    #[component(mut)]
    pub attacker_army: Account<'info, ArmyUnits>,
    #[component(mut)]
    pub defender_army: Account<'info, ArmyUnits>,
    // Ensure both armies are at the same position
    #[component]
    pub position: Account<'info, Position>,
}

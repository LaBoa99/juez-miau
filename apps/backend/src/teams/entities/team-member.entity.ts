import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { Team } from "./team.entity.js";

@Entity()
export class TeamMember {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare team_id: number

    @Column({ type: 'text' })
    declare full_name: string

    @Column({ type: 'text' })
    declare career: string

    @ManyToOne(() => Team, team => team.members)
    @JoinColumn({ name: 'team_id' })
    declare team: Relation<Team>;
    
}
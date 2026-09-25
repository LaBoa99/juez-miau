
export interface ICreateTeam {
    name: string
    category_id: number
    members: ICreateTeamMember[]
}

export interface ICreateTeamMember {
    name: string
    career: string
    semestre ?: number
}


export interface IUpdateTeam {
    name ?: string
    members ?: IUpdateTeamMember[]
}

export interface IUpdateTeamMember {
    name ?: string
    career ?: string
}

export interface ILanguage {
    id: string
    code: string
    image_ref: string
    compile_cmd: string
    run_cmd: string
    compiler_version: string
    flags: string
    file_ext: string
    time_multiplier: number
    active: boolean
}

export interface ILanguageSetEdition {
    ids: string[]
}

export type ICreateLanguage = Omit<ILanguage, "id" | "flags" | "active"> & Partial<Pick<ILanguage, "flags" | "active">>
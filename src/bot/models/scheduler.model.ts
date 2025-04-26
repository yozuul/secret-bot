import { Column, DataType, Model, Table, Default, PrimaryKey } from "sequelize-typescript";

const { UUIDV4, DATE, UUID } = DataType

@Table({ tableName: 'scheduler', timestamps: false })
export class Scheduler extends Model<Scheduler> {

   @PrimaryKey
   @Default(UUIDV4)
   @Column({
      type: UUID,
   }) declare id: string

   @Column({
      type: DATE, allowNull: true
   }) declare date: string
}
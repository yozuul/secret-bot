import { Column, DataType, Model, Table, Default, PrimaryKey } from "sequelize-typescript";

const { UUIDV4, STRING, UUID } = DataType

@Table({ tableName: 'users', timestamps: false })
export class Users extends Model<Users> {

   @PrimaryKey
   @Default(UUIDV4)
   @Column({
      type: UUID,
   }) declare id: string

   @Column({
      type: STRING, allowNull: false
   }) declare name: string

   @Column({
      type: STRING, allowNull: false
   }) declare phone: string

   @Column({
      type: STRING, allowNull: false
   }) declare tgId: string
}
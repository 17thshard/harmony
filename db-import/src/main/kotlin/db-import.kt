package com.seventeenthshard.harmony.dbimport

import com.seventeenthshard.harmony.events.*
import com.sksamuel.avro4k.Avro
import io.confluent.kafka.serializers.KafkaAvroDeserializer
import io.confluent.kafka.serializers.KafkaAvroDeserializerConfig
import io.confluent.kafka.serializers.subject.RecordNameStrategy
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.serializer
import org.apache.avro.generic.GenericRecord
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.logging.log4j.LogManager
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.*

class EventHandler(init: EventHandler.() -> Unit) {
    private val handlers = mutableMapOf<String, Handler<*>>()
    private val logger = LogManager.getLogger("EventHandler")

    init {
        this.init()
    }

    fun <T> addHandler(
        schemaName: String,
        deserializer: DeserializationStrategy<T>,
        handler: (id: String, event: T) -> Unit
    ) {
        handlers[schemaName] = Handler(deserializer, handler)
    }

    inline fun <reified T : Any> listen(noinline handler: (id: String, event: T) -> Unit) {
        addHandler(T::class.java.name, T::class.serializer(), handler)
    }

    fun consume(settings: Map<String, Any>, vararg topics: String) {
        val props = Properties()
        props.putAll(settings)

        KafkaConsumer<String, GenericRecord>(props).use { consumer ->
            consumer.subscribe(topics.toList())

            while (true) {
                consumer.poll(Duration.ofMillis(100)).forEach {
                    val record = it.value()
                    (handlers[it.value().schema.fullName] as? Handler<Any>)?.let { handler ->
                        val event = Avro.default.fromRecord(handler.deserializer, record)
                        handler.run(it.key(), event)
                        logger.info("Handled ${event.javaClass}")
                    }
                }
            }
        }
    }

    private data class Handler<T>(val deserializer: DeserializationStrategy<T>, val run: (id: String, event: T) -> Unit)
}

fun main() {
    Database.connect("jdbc:postgresql://localhost/harmony", "org.postgresql.Driver", "harmony_imports", "imp0rt5")

    transaction {
        SchemaUtils.createMissingTablesAndColumns(
            Servers,
            Channels,
            Users,
            UserNicknames,
            Roles,
            UserRoles,
            PermissionOverrides,
            Messages,
            MessageVersions
        )
    }

    val events = EventHandler {
        listen<ServerInfo> { serverId, event ->
            transaction {
                Servers.replace {
                    it[id] = serverId
                    it[name] = event.name
                    it[iconUrl] = event.iconUrl
                    it[active] = true
                }
            }
        }
        listen<ServerDeletion> { serverId, _ ->
            transaction {
                Servers.update({ Servers.id eq serverId }) {
                    it[active] = false
                }
            }
        }

        listen<RoleInfo> { roleId, event ->
            transaction {
                Roles.replace {
                    it[id] = roleId
                    it[server] = event.server.id
                    it[name] = event.name
                    it[color] = event.color
                    it[position] = event.position
                    it[permissions] = event.permissions
                }
            }
        }
        listen<RoleDeletion> { roleId, event ->
            transaction {
                Roles.update({ Roles.id eq roleId }) {
                    it[deletedAt] = LocalDateTime.ofInstant(event.timestamp, ZoneId.of("UTC"))
                }
            }
        }

        listen<ChannelInfo> { channelId, event ->
            transaction {
                Channels.replace {
                    it[id] = channelId
                    it[server] = event.server.id
                    it[name] = event.name
                    it[type] = event.type
                }

                PermissionOverrides.deleteWhere { PermissionOverrides.channel eq channelId }

                PermissionOverrides.batchInsert(event.permissionOverrides) {
                    this[PermissionOverrides.channel] = event.id
                    this[PermissionOverrides.type] = it.type
                    this[PermissionOverrides.target] = it.targetId
                    this[PermissionOverrides.allowed] = it.allowed
                    this[PermissionOverrides.denied] = it.denied
                }
            }
        }
        listen<ChannelDeletion> { channelId, event ->
            transaction {
                Channels.update({ Channels.id eq channelId }) {
                    it[deletedAt] = LocalDateTime.ofInstant(event.timestamp, ZoneId.of("UTC"))
                }
            }
        }

        listen<UserInfo> { _, event ->
            transaction {
                Users.replace {
                    it[id] = event.id
                    it[name] = event.username
                    it[discriminator] = event.discriminator
                }
            }
        }
        listen<UserNicknameChange> { userId, event ->
            transaction {
                val currentNickname = UserNicknames
                    .select {
                        (UserNicknames.server eq event.server.id) and (UserNicknames.user eq userId)
                    }
                    .orderBy(UserNicknames.timestamp to SortOrder.DESC)
                    .limit(1)
                    .firstOrNull()
                    ?.get(UserNicknames.nickname)

                if (currentNickname != event.nickname) {
                    UserNicknames.replace {
                        it[server] = event.server.id
                        it[user] = userId
                        it[timestamp] = LocalDateTime.ofInstant(event.timestamp, ZoneId.of("UTC"))
                        it[nickname] = event.nickname
                    }
                }
            }
        }
        listen<UserRolesChange> { userId, event ->
            transaction {
                UserRoles.deleteWhere { (UserRoles.server eq event.server.id) and (UserRoles.user eq userId) }

                UserRoles.batchInsert(event.roles) {
                    this[UserRoles.server] = event.server.id
                    this[UserRoles.user] = userId
                    this[UserRoles.role] = it
                }
            }
        }

        listen<NewMessage> { messageId, event ->
            transaction {
                Users.replace {
                    it[id] = event.user.id
                    it[name] = event.user.username
                    it[discriminator] = event.user.discriminator
                }

                val creationTimestamp = LocalDateTime.ofInstant(event.timestamp, ZoneId.of("UTC"))

                Messages.replace {
                    it[id] = messageId
                    it[server] = event.channel.server.id
                    it[channel] = event.channel.id
                    it[user] = event.user.id
                    it[createdAt] = creationTimestamp
                }

                MessageVersions.replace {
                    it[message] = messageId
                    it[timestamp] = creationTimestamp
                    it[content] = event.content
                }
            }
        }
        listen<MessageEdit> { messageId, event ->
            transaction {
                MessageVersions.replace {
                    it[message] = messageId
                    it[timestamp] = LocalDateTime.ofInstant(event.timestamp, ZoneId.of("UTC"))
                    it[content] = event.content
                }
            }
        }
        listen<MessageDeletion> { messageId, event ->
            transaction {
                Messages.update({ Messages.id eq messageId }) {
                    it[deletedAt] = LocalDateTime.ofInstant(event.timestamp, ZoneId.of("UTC"))
                }
            }
        }
    }

    events.consume(
        mapOf(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG to "localhost:9092",
            ConsumerConfig.GROUP_ID_CONFIG to "db-import",
            ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG to "true",
            ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG to "1000",
            ConsumerConfig.AUTO_OFFSET_RESET_CONFIG to "earliest",
            ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG to StringDeserializer::class.java,
            ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG to KafkaAvroDeserializer::class.java,
            KafkaAvroDeserializerConfig.VALUE_SUBJECT_NAME_STRATEGY to RecordNameStrategy::class.java,
            KafkaAvroDeserializerConfig.SCHEMA_REGISTRY_URL_CONFIG to "http://localhost:8081"
        ),
        "servers", "messages", "channels", "users", "roles"
    )
}
